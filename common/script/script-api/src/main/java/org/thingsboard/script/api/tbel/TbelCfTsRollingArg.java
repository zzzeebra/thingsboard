/**
 * Copyright © 2016-2024 The Thingsboard Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package org.thingsboard.script.api.tbel;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Getter;

import java.util.Collections;
import java.util.Iterator;
import java.util.List;
import java.util.function.Consumer;

import static org.thingsboard.script.api.tbel.TbelCfTsDoubleVal.OBJ_SIZE;

public class TbelCfTsRollingArg implements TbelCfArg, Iterable<TbelCfTsDoubleVal> {

    @Getter
    private final TbTimeWindow timeWindow;
    @Getter
    private final List<TbelCfTsDoubleVal> values;

    @JsonCreator
    public TbelCfTsRollingArg(
            @JsonProperty("timeWindow") TbTimeWindow timeWindow,
            @JsonProperty("values") List<TbelCfTsDoubleVal> values
    ) {
        this.timeWindow = timeWindow;
        this.values = Collections.unmodifiableList(values);
    }

    public TbelCfTsRollingArg(int limit, long timeWindow, List<TbelCfTsDoubleVal> values) {
        long ts = System.currentTimeMillis();
        this.timeWindow = new TbTimeWindow(ts - timeWindow, ts, limit);
        this.values = Collections.unmodifiableList(values);
    }

    @Override
    public long memorySize() {
        return 12 + values.size() * OBJ_SIZE;
    }

    @JsonIgnore
    public List<TbelCfTsDoubleVal> getValue() {
        return values;
    }

    public double max() {
        double max = Double.MIN_VALUE;
        for (TbelCfTsDoubleVal value : values) {
            double val = value.getValue();
            if (max < val) {
                max = val;
            }
        }
        return max;
    }

    @JsonIgnore
    public int getSize() {
        return values.size();
    }

    @Override
    public Iterator<TbelCfTsDoubleVal> iterator() {
        return values.iterator();
    }

    @Override
    public void forEach(Consumer<? super TbelCfTsDoubleVal> action) {
        values.forEach(action);
    }

    @Override
    public String getType() {
        return "TS_ROLLING";
    }

}
